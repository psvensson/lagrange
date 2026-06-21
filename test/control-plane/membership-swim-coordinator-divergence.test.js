// Coordinator-side SWIM divergence emission (increment 3c-ii-C): the coordinator
// diffs the wired-in SWIM runtime's active set against the projection's published
// set and logs MEMBERSHIP_SWIM_DIVERGENCE, mirroring the owner-divergence probe.
// Inert (no emission) unless a runtime is wired in (default-off).
import {test} from '../../src/test-helpers/tap.js';
import {MembershipPublicationCoordinatorReads} from
  '../../src/control-plane/membership-publication-coordinator-reads.js';

function buildCoordinator({runtime = null, nowRef} = {}) {
  const logged = [];
  const reads = new MembershipPublicationCoordinatorReads({
    nodeId: 'node-A',
    membershipSwimRuntime: runtime,
    now: () => nowRef.value,
    logger: {
      info: (msg, payload) => logged.push({msg, payload}),
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  });
  return {reads, logged};
}

function fakeRuntime(activeNodeIds) {
  return {activeMemberSet: () => activeNodeIds};
}

const SWIM_MSG = 'MEMBERSHIP_SWIM_DIVERGENCE';

test('no runtime wired => SWIM divergence probe is inert', (t) => {
  const nowRef = {value: 1000};
  const {reads, logged} = buildCoordinator({runtime: null, nowRef});
  reads._emitMembershipSwimDivergence({
    projectionNodeIds: ['a', 'b'],
    publishedBaselineNodeIds: ['a', 'b'],
    memberStatesByNodeId: {},
    membershipFreezeActive: false,
  });
  t.equal(logged.length, 0, 'nothing emitted without a runtime');
  t.end();
});

test('agreement emits agree=true', (t) => {
  const nowRef = {value: 1000};
  const {reads, logged} = buildCoordinator({
    runtime: fakeRuntime(['a', 'b']),
    nowRef,
  });
  reads._emitMembershipSwimDivergence({
    projectionNodeIds: ['a', 'b'],
    publishedBaselineNodeIds: ['a', 'b'],
    memberStatesByNodeId: {},
    membershipFreezeActive: false,
  });
  t.equal(logged.length, 1, 'one emission');
  t.equal(logged[0].msg, SWIM_MSG);
  t.equal(logged[0].payload.agree, true, 'agree when SWIM set == projection');
  t.end();
});

test('divergence reports the nodes only in projection vs only in SWIM', (t) => {
  const nowRef = {value: 1000};
  // SWIM trimmed 'c' (it considers c dead); projection still publishes it.
  const {reads, logged} = buildCoordinator({
    runtime: fakeRuntime(['a', 'b']),
    nowRef,
  });
  reads._emitMembershipSwimDivergence({
    projectionNodeIds: ['a', 'b', 'c'],
    publishedBaselineNodeIds: ['a', 'b', 'c'],
    memberStatesByNodeId: {},
    membershipFreezeActive: false,
  });
  t.equal(logged.length, 1);
  t.equal(logged[0].payload.agree, false);
  t.same(logged[0].payload.onlyInProjection, ['c'], 'c only in projection');
  t.same(logged[0].payload.onlyInShadow, [], 'nothing only in SWIM');
  t.equal(logged[0].payload.divergenceCount, 1);
  t.end();
});

test('repeated identical state is snapshot-throttled', (t) => {
  const nowRef = {value: 1000};
  const {reads, logged} = buildCoordinator({
    runtime: fakeRuntime(['a', 'b']),
    nowRef,
  });
  const inputs = {
    projectionNodeIds: ['a', 'b'],
    publishedBaselineNodeIds: ['a', 'b'],
    memberStatesByNodeId: {},
    membershipFreezeActive: false,
  };
  reads._emitMembershipSwimDivergence(inputs); // transition -> emit
  reads._emitMembershipSwimDivergence(inputs); // same state, within interval -> throttled
  t.equal(logged.length, 1, 'second identical emit throttled');
  nowRef.value += 31000; // past the 30s snapshot interval
  reads._emitMembershipSwimDivergence(inputs);
  t.equal(logged.length, 2, 'snapshot re-emits after the interval');
  t.equal(logged[1].payload.emitKind, 'snapshot');
  t.end();
});

test('emission never throws even if the runtime misbehaves', (t) => {
  const nowRef = {value: 1000};
  const {reads, logged} = buildCoordinator({
    runtime: {activeMemberSet: () => {
      throw new Error('runtime boom');
    }},
    nowRef,
  });
  reads._emitMembershipSwimDivergence({
    projectionNodeIds: ['a'],
    publishedBaselineNodeIds: ['a'],
    memberStatesByNodeId: {},
    membershipFreezeActive: false,
  });
  t.equal(logged.length, 0, 'a throwing runtime is swallowed (diagnostics-only)');
  t.end();
});
