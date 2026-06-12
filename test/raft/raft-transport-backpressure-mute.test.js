/**
 * CL-009(ii)/CL-003 guard: raft packet delivery must honor outbound
 * backpressure rejections with a per-peer mute window instead of
 * re-attempting every fan-out send against a saturated peer lane.
 *
 * Production witness (stat-gate-20260611T090827Z run1): 6,434 rejected
 * sends to one REPLACE-created learner replica in ~3 minutes while the
 * learner starved and failed voter-ready promotion within its 60s budget —
 * the direct blocker behind CL-003's recovering_in_flight spread recovery.
 *
 * Safety: raft is built on lossy channels; a muted (dropped) send is
 * retransmitted by liferaft. Only BACKGROUND sends are muted — critical and
 * readiness traffic may still pass via the critical reserve.
 *
 * Tests exercise deliverRaftPacketWithBackpressureMute, the seam the real
 * raft send paths use (raft-group deliverPacket, raft-replica-base runtime
 * helpers, partition-raft-node write). The former RaftTransportAdapter
 * harness was dead code (never instantiated in src — the CL-003 lesson) and
 * has been removed per cleanup requirement 5.1.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  RaftPeerBackpressureMute,
  deliverRaftPacketWithBackpressureMute,
} from '../../src/raft/raft-peer-backpressure-mute.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
} from '../../src/transport/message-router-shared-stage-1.js';

const PEER_ADDRESS = 'node-b/partition/sql_transactions-p1-r4';

function createTransport({deliverImpl}) {
  const calls = {deliver: 0};
  const transport = {
    deliver: async (...args) => {
      calls.deliver += 1;
      return deliverImpl(...args);
    },
  };
  return {transport, calls};
}

function buildBackpressureError(retryAfterMs = 200) {
  const error = new Error('Outbound queue backpressured');
  error.code = OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE;
  error.retryAfterMs = retryAfterMs;
  error.deferRetry = true;
  return error;
}

// Append packet with entries resolves to BACKGROUND delivery priority.
function buildAppendPacket() {
  return {
    type: 'append',
    destination: PEER_ADDRESS,
    address: 'node-a/partition/sql_transactions-p1-r1',
    term: 3,
    data: [{command: 'x'}],
  };
}

// Vote packets resolve to CRITICAL delivery priority.
function buildVotePacket() {
  return {
    type: 'vote',
    destination: PEER_ADDRESS,
    address: 'node-a/partition/sql_transactions-p1-r1',
    term: 3,
  };
}

function sendViaMute(transport, mute, packet, peerAddress = PEER_ADDRESS) {
  return deliverRaftPacketWithBackpressureMute(
    transport, peerAddress, packet, mute,
  ).then(
    (result) => ({error: null, result}),
    (error) => ({error, result: null}),
  );
}

test('CL-009(ii): raft per-peer backpressure mute', async (t) => {
  await t.test(
    'backpressure rejection mutes subsequent background sends',
    async (t) => {
      let failNext = true;
      const {transport, calls} = createTransport({
        deliverImpl: async () => {
          if (failNext) {
            throw buildBackpressureError(200);
          }
          return {delivered: true};
        },
      });
      const mute = new RaftPeerBackpressureMute();

      const first = await sendViaMute(transport, mute, buildAppendPacket());
      t.equal(
        first.error?.code,
        OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
        'first send surfaces the backpressure error',
      );
      t.equal(calls.deliver, 1, 'first send reached the router');

      const second = await sendViaMute(transport, mute, buildAppendPacket());
      t.equal(calls.deliver, 1, 'muted send never reaches the router');
      t.equal(
        second.error?.peerBackpressureMuted,
        true,
        'muted error is marked',
      );
      t.ok(
        second.error?.retryAfterMs > 0,
        'muted error carries the remaining window',
      );
      t.equal(second.error?.deferRetry, true, 'muted error defers retry');
      failNext = false;
    },
  );

  await t.test('critical sends bypass the mute', async (t) => {
    const {transport, calls} = createTransport({
      deliverImpl: async () => {
        throw buildBackpressureError(10_000);
      },
    });
    const mute = new RaftPeerBackpressureMute();

    await sendViaMute(transport, mute, buildAppendPacket());
    t.equal(calls.deliver, 1, 'background send muted the peer');

    const voteAttempt = await sendViaMute(transport, mute, buildVotePacket());
    t.equal(calls.deliver, 2, 'vote still reaches the router');
    t.equal(
      voteAttempt.error?.code,
      OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
      'vote outcome reflects the router, not the mute',
    );
  });

  await t.test('mute expires and a successful send clears it', async (t) => {
    let failNext = true;
    const {transport, calls} = createTransport({
      deliverImpl: async () => {
        if (failNext) {
          throw buildBackpressureError(30);
        }
        return {delivered: true};
      },
    });
    const mute = new RaftPeerBackpressureMute();

    await sendViaMute(transport, mute, buildAppendPacket());
    t.equal(calls.deliver, 1, 'peer muted');
    failNext = false;

    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterExpiry = await sendViaMute(transport, mute, buildAppendPacket());
    t.equal(calls.deliver, 2, 'send resumes after the window');
    t.equal(afterExpiry.error, null, 'send succeeds');
    t.equal(
      mute.mutedUntilMsByKey.size,
      0,
      'success clears the mute bookkeeping',
    );
  });

  await t.test('non-backpressure errors do not mute', async (t) => {
    const {transport, calls} = createTransport({
      deliverImpl: async () => {
        throw new Error('Message not acknowledged');
      },
    });
    const mute = new RaftPeerBackpressureMute();

    await sendViaMute(transport, mute, buildAppendPacket());
    await sendViaMute(transport, mute, buildAppendPacket());
    t.equal(calls.deliver, 2, 'ordinary failures keep attempting');
  });

  await t.test(
    'default shared mute: omitting the mute argument still mutes',
    async (t) => {
      let deliverCalls = 0;
      const transport = {
        deliver: async () => {
          deliverCalls += 1;
          throw buildBackpressureError(200);
        },
      };
      // Distinct peer so the module-level shared mute does not leak state
      // into other subtests.
      const sharedPeer = 'node-shared/partition/sql_transactions-p1-r2';
      const packet = {...buildAppendPacket(), destination: sharedPeer};

      await deliverRaftPacketWithBackpressureMute(
        transport, sharedPeer, packet,
      ).catch((error) => error);
      const second = await deliverRaftPacketWithBackpressureMute(
        transport, sharedPeer, packet,
      ).catch((error) => error);

      t.equal(deliverCalls, 1, 'second send muted before the transport');
      t.equal(second.peerBackpressureMuted, true, 'muted error marked');
    },
  );

  await t.test(
    'node-scoped rejections mute every replica lane on the node',
    async (t) => {
      let deliverCalls = 0;
      const transport = {
        deliver: async () => {
          deliverCalls += 1;
          const error = buildBackpressureError(10_000);
          error.backpressureScope = 'node';
          throw error;
        },
      };
      const mute = new RaftPeerBackpressureMute();
      const packet = buildAppendPacket();
      const siblingAddress = 'node-b/partition/sql_write_operations-p1-r4';

      await deliverRaftPacketWithBackpressureMute(
        transport, PEER_ADDRESS, packet, mute,
      ).catch((error) => error);
      const sibling = await deliverRaftPacketWithBackpressureMute(
        transport, siblingAddress, packet, mute,
      ).catch((error) => error);

      t.equal(
        deliverCalls,
        1,
        'sibling replica on the same node is muted too',
      );
      t.equal(sibling.peerBackpressureMuted, true, 'sibling error marked');
    },
  );
});
