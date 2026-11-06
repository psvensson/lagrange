import {test} from '../../src/test-helpers/tap.js';
import {createCommittedFloorHarness, floorNodeRow, FLOOR_NODE_IDS} from
  './committed-node-remove-safety-fixture.js';
import {readCommittedNodeFloor} from
  '../../src/rebalancer/operation-workflow-committed-node-floor.js';
import {PriorityPublicationSafetyTopology} from
  '../../src/rebalancer/priority-publication-safety-topology.js';

test('floor reference validation and credit cannot borrow a replaced Map lookup', async (t) => {
  const boundary = {resolveTimeoutCheckNowMs: () => 1000,
    controlPlaneReadinessService: {
      readServeEligibility: async () => {},
      answerCommittedNodes: () => ({state: 'ready', nodeRows: [
        floorNodeRow('current-node'), floorNodeRow('expired-node', 999),
      ]}),
    }};
  const originalGet = Map.prototype.get;
  const topology = PriorityPublicationSafetyTopology.prototype;
  const context = {isVoterReadyReplicaTopology: topology.isVoterReadyReplicaTopology};
  const replica = {node_id: 'expired-node', status: 'active', raft_role: 'follower',
    address: 'expired-node/partition/example-r2'};
  const floor = await readCommittedNodeFloor(boundary, [replica]);
  const normalCredit = topology.isVoterReadyFloorCountableReplica.call(context, replica,
    {committedNodeFloor: floor});
  const normalMissing = await readCommittedNodeFloor(boundary, [{}]);
  let poisonedMissing;
  let poisonedCredit;
  let replacementsCalled = 0;
  try {
    // eslint-disable-next-line no-extend-native -- restored adversarial authority fixture
    Map.prototype.get = function(key) {
      // Async test bookkeeping also uses Maps. Measure only the node keys
      // in this controlled observation and its missing required reference.
      if (key === undefined || key === 'expired-node' || key === 'current-node') {
        replacementsCalled++;
      }
      const value = originalGet.call(this, key);
      if (key === undefined) {
        return {statusSemantics: {valid: true},
          leaseSemantics: {state: 'valid'}, readyNow: true};
      }
      return key === 'expired-node' && value?.statusSemantics ? {...value, readyNow: true} : value;
    };
    poisonedMissing = await readCommittedNodeFloor(boundary, [{}]);
    poisonedCredit = topology.isVoterReadyFloorCountableReplica.call(context, replica,
      {committedNodeFloor: floor});
  } finally {
    // eslint-disable-next-line no-extend-native -- restore the prior intrinsic
    Map.prototype.get = originalGet;
  }
  t.equal(normalMissing.state, 'unavailable');
  t.equal(poisonedMissing.state, 'unavailable', 'missing identity remains unavailable after admission');
  t.equal(normalCredit, false);
  t.equal(poisonedCredit, false, 'expired canonical evidence cannot acquire floor credit');
  t.equal(replacementsCalled, 0, 'admission, projection lookup and credit use captured reads');
  t.equal(topology.isVoterReadyFloorCountableReplica.call(context,
    {...replica, node_id: 'current-node'}, {committedNodeFloor: floor}), true,
  'genuine committed current evidence continues to count');
});

test('partition floor consumes committed nodes once and ignores positive cache participation',
  async (t) => {
    const h = await createCommittedFloorHarness();
    t.teardown(() => h.shutdown());
    t.equal(Object.hasOwn(h.owner, 'systemTableCache'), false,
      'actual workflow construction has no cache alias');
    h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1], 999);
    const denied = await h.owner.evaluateRemoveSafety(h.operation);
    t.equal(denied.classification, 'fail',
      'known insufficient floor retains ordinary REMOVE refusal semantics');
    t.match(denied.error, /below minimum/);
    t.equal(h.state.refreshes, 1, 'one owner refresh for the floor');
    t.equal(h.state.answers, 1, 'one committed answer for all replicas');
    h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1]);
    h.state.participation = false;
    const recovered = await h.owner.evaluateRemoveSafety(h.operation);
    t.equal(recovered.classification, 'safe',
      'current committed nodes supply floor credit despite unrelated projection denial');
  });

test('unavailable and malformed committed nodes cannot take the source-not-counted SAFE exit',
  async (t) => {
    const cases = [
      ['failed read', {fail: true}],
      ['empty nodes', {nodes: []}],
      ['non-array nodes', {nodes: {}}],
      ['missing source', {nodes: FLOOR_NODE_IDS.slice(1).map((id) => floorNodeRow(id))}],
      ['sparse nodes', {nodes: new Array(4)}],
      ['duplicate identity', {nodes: [...FLOOR_NODE_IDS.map((id) => floorNodeRow(id)), floorNodeRow(FLOOR_NODE_IDS[0])]}],
    ];
    for (const lease of [undefined, NaN, Infinity, -1, -0, 5000.5, {}, 'bad']) {
      cases.push([`invalid source lease ${String(lease)}`, {
        nodes: FLOOR_NODE_IDS.map((id, index) => index ? floorNodeRow(id) :
          {...floorNodeRow(id), ready_lease_expires_at: lease}),
      }]);
    }
    for (const [name, options] of cases) {
      const h = await createCommittedFloorHarness(options);
      try {
        const result = await h.owner.evaluateRemoveSafety(h.operation);
        t.equal(result.classification, 'defer', name);
        t.match(result.error, /committed node.*unavailable/, name);
      } finally {
        await h.shutdown();
      }
    }
  });

test('a committed SQL read held across expiry returns the owner STALE refusal', async (t) => {
  const h = await createCommittedFloorHarness();
  t.teardown(() => h.shutdown());
  h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1], 1500);
  let release;
  h.state.hold = new Promise((resolve) => {
    release = resolve;
  });
  const pending = h.owner.evaluateRemoveSafety(h.operation);
  for (let turn = 0; turn < 20 && h.state.reads === 0; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  t.equal(h.state.reads, 1, 'the actual committed read is held');
  h.state.nowMs = 2000;
  h.state.hold = null;
  release();
  const result = await pending;
  t.equal(result.classification, 'defer',
    'the source stays current but the peer cannot reuse pre-read credit');
});

test('known non-countable source evidence stays distinct from unavailable authority', async (t) => {
  for (const patch of [{ready_lease_expires_at: null}, {ready_lease_expires_at: 0},
    {status: 'stopped'}, {status: 'failed'}]) {
    const h = await createCommittedFloorHarness();
    try {
      h.state.nodes[0] = {...h.state.nodes[0], ...patch};
      t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'safe',
        'known non-countable source preserves the existing floor rule');
    } finally {
      await h.shutdown();
    }
  }
});

test('invalid decision time and malformed peer or source status defer; valid owned numeric strings count',
  async (t) => {
    const h = await createCommittedFloorHarness();
    t.teardown(() => h.shutdown());
    h.state.nodes = FLOOR_NODE_IDS.map((id) => floorNodeRow(id, '5000'));
    t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'safe');
    for (const nodeIndex of [0, 1]) {
      h.state.nodes[nodeIndex] = {...floorNodeRow(FLOOR_NODE_IDS[nodeIndex]), status: 'invented-status'};
      t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'defer');
      h.state.nodes[nodeIndex] = {
        ...floorNodeRow(FLOOR_NODE_IDS[nodeIndex]), ready_lease_expires_at: 5000.5,
      };
      t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'defer');
      h.state.nodes[nodeIndex] = floorNodeRow(FLOOR_NODE_IDS[nodeIndex]);
    }
    for (const nowMs of [NaN, Infinity, -0, -1, 1000.5, '1000']) {
      h.owner.timeSource = {now: () => nowMs};
      t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'defer');
    }
    h.owner.timeSource = {now: () => h.state.nowMs};
    t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'safe',
      'a valid observation replaces the earlier malformed record');
    h.state.fail = true;
    t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'safe',
      'the real committed owner retains its valid record across read failure');
  });


test('a malformed source topology reference cannot become non-countable SAFE evidence', async (t) => {
  const h = await createCommittedFloorHarness();
  t.teardown(() => h.shutdown());
  h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1], 999);
  const baseline = await h.owner.evaluateRemoveSafety(h.operation);
  t.equal(baseline.classification, 'fail');
  t.match(baseline.error, /below minimum/);
  const readRows = h.owner.getCriticalReplicaRowsForSafety.bind(h.owner);
  let corruptRow = (row) => row;
  // This is the topology owner's returned population boundary; the test
  // does not claim that the SQL SERVICES ingress originated malformed rows.
  h.owner.getCriticalReplicaRowsForSafety = async (...args) =>
    (await readRows(...args)).map((row) => row.replica_id === h.operation.replicaId ?
      corruptRow(row) : row);
  for (const nodeId of [undefined, null, '', ' ', false, {}]) {
    corruptRow = (row) => ({...row, node_id: nodeId});
    const result = await h.owner.evaluateRemoveSafety(h.operation);
    t.equal(result.classification, 'defer', 'unusable source identity is unavailable');
    t.match(result.error, /committed_referenced_node_unavailable/);
  }
  let getterCalls = 0;
  corruptRow = (row) => Object.defineProperty({...row}, 'node_id', {
    enumerable: true, get() {
      getterCalls++; return FLOOR_NODE_IDS[0];
    },
  });
  t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'defer');
  t.equal(getterCalls, 0, 'reference admission does not execute a getter');
  corruptRow = (row) => row;
  t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'fail',
    'restoring identity restores the genuine below-minimum refusal');
});

test('ordinary REMOVE evaluates replica nodes independently of its initiating coordinator', async (t) => {
  const h = await createCommittedFloorHarness({initiatorNodeId: 'external-initiator'});
  t.teardown(() => h.shutdown());
  t.equal(h.operation.sourceNodeId, 'external-initiator', 'canonical producer names the initiator');
  t.equal(h.operation.targetNodeId, FLOOR_NODE_IDS[0], 'the physical REMOVE target is separate');
  t.equal(h.state.nodes.some((row) => row.node_id === h.operation.sourceNodeId), false);
  t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'safe');
  h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1], 999);
  t.equal((await h.owner.evaluateRemoveSafety(h.operation)).classification, 'fail',
    'a genuinely insufficient replica floor still denies with that initiator');
});

for (const useCapturedClock of [false, true]) {
  test(`floor time is captured after the adopted read returns (stale-clock control=${useCapturedClock})`,
    async (t) => {
      const h = await createCommittedFloorHarness();
      t.teardown(() => h.shutdown());
      h.state.nodes[1] = floorNodeRow(FLOOR_NODE_IDS[1], 1500);
      const capturedNowMs = h.state.nowMs;
      if (useCapturedClock) h.owner.timeSource = {now: () => capturedNowMs};
      const read = h.readiness.readServeEligibility.bind(h.readiness);
      let adopted = false;
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      h.readiness.readServeEligibility = async () => {
        await read();
        adopted = true;
        await held;
      };
      const pending = h.owner.evaluateRemoveSafety(h.operation);
      for (let turn = 0; turn < 20 && !adopted; turn++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      t.equal(adopted, true, 'the real committed owner has adopted the observation');
      h.state.nowMs = 2000;
      t.equal(h.readiness.answerCommittedNodes().state, 'ready',
        'the independent STALE veto cannot mask the floor time assertion');
      const inspectionAnswers = h.state.answers;
      release();
      const result = await pending;
      t.equal(result.classification, useCapturedClock ? 'safe' : 'fail',
        'only the deliberately stale decision clock reuses expired peer credit');
      if (!useCapturedClock) t.match(result.error, /below minimum/);
      t.equal(h.state.refreshes, 1);
      t.equal(h.state.answers - inspectionAnswers, 1, 'one floor sample after the inspection');
      t.equal(h.state.timerFires, 0, 'neither arm fires the independent lease timer');
    });
}
