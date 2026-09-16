// Consistency mode is chosen by the caller's contract, never by response
// latency.
//
// The defect these seal: the best-effort planning surface raced a synchronous
// answer against an asynchronous refresh with a 1000 ms deadline and returned
// whichever arrived first, so identical logical state produced different
// planning answers purely because one machine ran the Promise chain faster.
// In the deterministic simulator that flipped a real scheduling decision: a
// 200 ms host block changed which timer was queued and moved the transcript.
//
// Two modes now exist and are tested apart:
//   AVAILABLE      - the canonical synchronous answer at the decision boundary
//   AUTHORITATIVE  - an explicitly requested owner read, whose wait belongs to
//                    the caller's contract
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {heldPromise, isPending} from '../helpers/promise-settlement.js';

const NODE_ID = 'node-a';
const OBSERVED_AT = 1000;

// A readiness service stub whose two evidence sources deliberately disagree,
// so which one a caller consumed is observable in the answer itself.
function planningService({asyncAnswer, armed = []}) {
  const service = Object.create(
    Object.getPrototypeOf(ControlPlaneReadinessService.prototype));
  Object.assign(service, {
    membershipPublicationPlanningSnapshotRefreshTimeoutMs: 1000,
    setTimeoutFn: (fn, delayMs) => {
      armed.push(delayMs);
      return {delayMs};
    },
    clearTimeoutFn: () => {},
    getMembershipPublicationPlanningAnswerSync: () => ({source: 'available'}),
    getMembershipPublicationPlanningSnapshot: () => asyncAnswer,
    resolvePriorityRecoveryPlanningAnswer: (_nodeId, _at, answer) => answer,
  });
  service.getMembershipPublicationPlanningSnapshotBestEffort =
    ControlPlaneReadinessService.prototype
      .getMembershipPublicationPlanningSnapshotBestEffort.bind(service);
  return service;
}

test('the available answer does not change with refresh latency, in any of four shapes',
  async () => {
    const shapes = {
      immediate: Promise.resolve({source: 'refresh'}),
      deepChain: (async () => {
        let chain = Promise.resolve();
        for (let turn = 0; turn < 256; turn += 1) chain = chain.then((v) => v);
        await chain;
        return {source: 'refresh'};
      })(),
      neverSettles: heldPromise().promise,
      rejected: Promise.reject(new Error('refresh failed')),
    };
    shapes.rejected.catch(() => undefined);
    for (const [name, asyncAnswer] of Object.entries(shapes)) {
      const armed = [];
      const service = planningService({asyncAnswer, armed});
      const answer = await service.getMembershipPublicationPlanningSnapshotBestEffort(
        NODE_ID, OBSERVED_AT);
      assert.deepEqual(answer, {source: 'available'},
        `refresh shape ${name} must not decide the available answer`);
      assert.deepEqual(armed, [],
        `refresh shape ${name} must arm no planning-refresh race timer`);
    }
  });

test('an unresolved refresh never delays the available answer', async () => {
  const held = heldPromise();
  const service = planningService({asyncAnswer: held.promise});
  const answer = service.getMembershipPublicationPlanningSnapshotBestEffort(
    NODE_ID, OBSERVED_AT);
  assert.equal(await isPending(answer), false,
    'the available answer is ready without waiting on any refresh');
  assert.deepEqual(await answer, {source: 'available'});
  held.release({source: 'refresh'});
});

test('a priority control-plane safety read is authoritative and defers without it',
  async () => {
    const {
      PriorityPublicationSafetyRows,
    } = await import('../../src/rebalancer/priority-publication-safety-rows.js');
    const calls = [];
    // A priority control-plane partition that is NOT control_plane_publications.
    // Authoritative evidence says the publication is still open, which defers
    // removal; the available surface would say CLOSED and permit it.
    const instance = Object.create(PriorityPublicationSafetyRows.prototype);
    instance.nodeId = NODE_ID;
    instance.controlPlaneReadinessService = {
      getPriorityRecoveryPlanningAnswerForOwnerRead: async () => {
        calls.push('authoritative');
        return {publicationStatus: 'OPEN'};
      },
      getPriorityRecoveryPlanningSnapshotBestEffort: async () => {
        calls.push('available');
        return {publicationStatus: 'PUBLISHED'};
      },
      getMembershipPublicationPlanningSnapshotBestEffort: async () => {
        calls.push('available');
        return {publicationStatus: 'PUBLISHED'};
      },
    };
    const operation = {partition_id: 'schema_operations-p1'};
    const answer = await instance
      .readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety(
        operation);
    assert.deepEqual(calls, ['authoritative'],
      'a safety decision reads the authoritative surface and nothing else');
    assert.deepEqual(answer, {publicationStatus: 'OPEN'});

    // Authoritative evidence unavailable: removal defers rather than
    // consuming the available answer to make progress.
    calls.length = 0;
    delete instance.controlPlaneReadinessService
      .getPriorityRecoveryPlanningAnswerForOwnerRead;
    const deferred = await instance
      .readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety(
        operation);
    assert.equal(deferred, null,
      'absent authoritative evidence defers; it never falls back to AVAILABLE');
    assert.deepEqual(calls, [],
      'and no available-mode read is attempted for a safety decision');
  });
