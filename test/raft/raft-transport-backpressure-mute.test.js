/**
 * CL-009(ii)/CL-003 guard: the raft transport adapter must honor outbound
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
 */

import {test} from '../../src/test-helpers/tap.js';
import {RaftTransportAdapter} from '../../src/raft/raft-transport-adapter.js';
import {
  RaftPeerBackpressureMute,
  deliverRaftPacketWithBackpressureMute,
} from '../../src/raft/raft-peer-backpressure-mute.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
} from '../../src/transport/message-router-shared-stage-1.js';

const PEER_ADDRESS = 'node-b/partition/sql_transactions-p1-r4';

function createAdapter({deliverImpl}) {
  const calls = {deliver: 0};
  const adapter = new RaftTransportAdapter({
    messageRouter: {
      deliver: async (...args) => {
        calls.deliver += 1;
        return deliverImpl(...args);
      },
    },
    entityType: 'partition',
    nodeId: 'node-a',
  });
  return {adapter, calls};
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

function writeAsync(adapter, packet) {
  return new Promise((resolve) => {
    adapter.write(packet, (error, result) => resolve({error, result}));
  });
}

test('CL-009(ii): raft transport per-peer backpressure mute', async (t) => {
  await t.test(
    'backpressure rejection mutes subsequent background sends',
    async (t) => {
      let failNext = true;
      const {adapter, calls} = createAdapter({
        deliverImpl: async () => {
          if (failNext) {
            throw buildBackpressureError(200);
          }
          return {delivered: true};
        },
      });

      const first = await writeAsync(adapter, buildAppendPacket());
      t.equal(
        first.error?.code,
        OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
        'first send surfaces the backpressure error',
      );
      t.equal(calls.deliver, 1, 'first send reached the router');

      const second = await writeAsync(adapter, buildAppendPacket());
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
    const {adapter, calls} = createAdapter({
      deliverImpl: async () => {
        throw buildBackpressureError(10_000);
      },
    });
    await writeAsync(adapter, buildAppendPacket());
    t.equal(calls.deliver, 1, 'background send muted the peer');

    const voteAttempt = await writeAsync(adapter, buildVotePacket());
    t.equal(calls.deliver, 2, 'vote still reaches the router');
    t.equal(
      voteAttempt.error?.code,
      OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
      'vote outcome reflects the router, not the mute',
    );
  });

  await t.test('mute expires and a successful send clears it', async (t) => {
    let failNext = true;
    const {adapter, calls} = createAdapter({
      deliverImpl: async () => {
        if (failNext) {
          throw buildBackpressureError(30);
        }
        return {delivered: true};
      },
    });

    await writeAsync(adapter, buildAppendPacket());
    t.equal(calls.deliver, 1, 'peer muted');
    failNext = false;

    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterExpiry = await writeAsync(adapter, buildAppendPacket());
    t.equal(calls.deliver, 2, 'send resumes after the window');
    t.equal(afterExpiry.error, null, 'send succeeds');
    t.equal(
      adapter.peerBackpressureMute.mutedUntilMsByKey.size,
      0,
      'success clears the mute bookkeeping',
    );
  });

  await t.test('non-backpressure errors do not mute', async (t) => {
    const {adapter, calls} = createAdapter({
      deliverImpl: async () => {
        throw new Error('Message not acknowledged');
      },
    });
    await writeAsync(adapter, buildAppendPacket());
    await writeAsync(adapter, buildAppendPacket());
    t.equal(calls.deliver, 2, 'ordinary failures keep attempting');
  });

  await t.test(
    'production wrapper: deliverRaftPacketWithBackpressureMute mutes the ' +
      'raw transport.deliver pattern used by the real raft send paths',
    async (t) => {
      let deliverCalls = 0;
      const transport = {
        deliver: async () => {
          deliverCalls += 1;
          throw buildBackpressureError(200);
        },
      };
      const mute = new RaftPeerBackpressureMute();
      const packet = buildAppendPacket();

      await deliverRaftPacketWithBackpressureMute(
        transport, PEER_ADDRESS, packet, mute,
      ).catch((error) => error);
      const second = await deliverRaftPacketWithBackpressureMute(
        transport, PEER_ADDRESS, packet, mute,
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
