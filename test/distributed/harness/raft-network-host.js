/**
 * raft-network-host — wire REAL @markwylde/liferaft nodes' vote/append RPCs over a
 * DT6 VirtualNetwork (deterministic-directed-testing-plan.md, "REMAINING toward full DT6":
 * a SECOND real raft node exchanging real vote/append RPCs over the network).
 *
 * DT6 step 2 hosted ONE real raft node on the network and modelled "leader contact" as a
 * bare heartbeat message. Step 3 wires the ACTUAL liferaft transport: each node's outbound
 * packets travel as VirtualNetwork messages and its real `on('data')` handler processes the
 * inbound ones, so a real multi-node election runs entirely over the seeded network.
 *
 * The transport shape (liferaft's request/reply model, see node_modules/@markwylde/liferaft):
 *   - `raft.message(who, packet)` calls each peer's join-`write(packet, written)`; the
 *     `written(err, reply)` callback is how liferaft receives the REPLY to that packet (on a
 *     non-empty reply it re-emits it as inbound `data`). So a write is a request that expects
 *     at most one correlated reply.
 *   - We send the packet as a `raftReq` message carrying a `reqId`; the receiver feeds it to
 *     its real handler via `raft.emit('data', packet, reply => ...)` and routes the handler's
 *     reply back as a `raftReply` with the same `reqId`; delivering that reply fires the
 *     original `written` callback. Empty replies (liferaft's `write()` with no packet) carry
 *     `null` and fire `written(null, undefined)` — no inbound re-emit, exactly as a real
 *     transport behaves.
 *
 * Determinism: every packet is a VirtualNetwork message, so the seeded scheduler controls
 * delivery order; liferaft's only nondeterminism on this path is the election-timeout RNG
 * (seed it with a per-node SeededRandomSource via `randomSource`, the DT5 seam) — `+new Date()`
 * feeds only the diagnostic `raft.latency`, not any election decision. Real liferaft handlers
 * are async, so an election completes across MICROTASKS, not within one synchronous drain:
 * use `driveNetwork` (bounded `run({untilMs})` + `flushMicrotasks` between drains), the async
 * analog of draining to idle. The V8 microtask queue is FIFO, so the drive is deterministic.
 */

import LifeRaft from '../../../src/raft/liferaft.js';

const RAFT_NETWORK_NUM_ZERO = 0;
const RAFT_NETWORK_NUM_ONE = 1;
const RAFT_NETWORK_DEFAULT_LINK_DELAY_MS = 1;
const RAFT_NETWORK_DEFAULT_STEP_MS = 2;
const RAFT_NETWORK_DEFAULT_FLUSH_TURNS = 8;
const RAFT_NETWORK_MSG_REQUEST = 'raftReq';
const RAFT_NETWORK_MSG_REPLY = 'raftReply';

/**
 * Yield to the microtask queue enough turns for liferaft's chained async handlers (emit ->
 * await packet() -> write reply) to settle between synchronous network drains.
 * @param {number} [turns]
 * @return {Promise<void>}
 */
async function flushMicrotasks(turns = RAFT_NETWORK_DEFAULT_FLUSH_TURNS) {
  for (let i = RAFT_NETWORK_NUM_ZERO; i < turns; i += RAFT_NETWORK_NUM_ONE) {
    await Promise.resolve();
  }
}

/**
 * Host a cluster of REAL liferaft nodes on a VirtualNetwork, wiring their vote/append RPCs
 * over it with request/reply correlation. Nodes are registered, then constructed on per-node
 * network clocks, then fully joined (every ordered pair) so `message(FOLLOWER, ...)` reaches
 * every peer over the network.
 * @param {Object} net - a VirtualNetwork (createVirtualNetwork).
 * @param {string[]} ids - node addresses (use an ODD count for a canonical cluster).
 * @param {Function} [makeOptions] - id -> extra LifeRaft options (election window, randomSource,
 *   write sink). A `timeSource` is always injected (the node's network clock) and must not be
 *   overridden.
 * @param {Object} [options] - {linkDelayMs}.
 * @return {Map<string, LifeRaft>} address -> live raft node.
 */
function connectRaftCluster(net, ids, makeOptions = () => ({}), options = {}) {
  const linkDelayMs = Number.isFinite(Number(options.linkDelayMs)) ?
    Number(options.linkDelayMs) :
    RAFT_NETWORK_DEFAULT_LINK_DELAY_MS;
  const rafts = new Map();
  const pendingReplies = new Map();
  let reqSeq = RAFT_NETWORK_NUM_ZERO;

  // Register handlers FIRST (networkTimeSource needs the node registered before the LifeRaft
  // constructor arms its election timer). The handler closes over `rafts`, populated below.
  for (const id of ids) {
    net.registerNode(id, (message, api) => {
      const raft = rafts.get(id);
      if (!raft) {
        return;
      }
      if (message.type === RAFT_NETWORK_MSG_REQUEST) {
        // Feed the inbound packet to the REAL handler; route its reply back, correlated.
        raft.emit('data', message.payload.packet, (reply) => {
          api.send({
            from: id,
            to: message.from,
            type: RAFT_NETWORK_MSG_REPLY,
            payload: {reply: reply || null, reqId: message.payload.reqId},
            delayMs: linkDelayMs,
          });
        });
      } else if (message.type === RAFT_NETWORK_MSG_REPLY) {
        const written = pendingReplies.get(message.payload.reqId);
        if (written) {
          pendingReplies.delete(message.payload.reqId);
          written(null, message.payload.reply || undefined);
        }
      }
    });
  }

  for (const id of ids) {
    rafts.set(id, new LifeRaft(id, {
      'timeSource': net.networkTimeSource(id),
      ...makeOptions(id),
    }));
  }

  for (const from of ids) {
    for (const to of ids) {
      if (from === to) {
        continue;
      }
      rafts.get(from).join(to, (packet, written) => {
        const reqId = (reqSeq += RAFT_NETWORK_NUM_ONE);
        if (typeof written === 'function') {
          pendingReplies.set(reqId, written);
        }
        net.send({
          from,
          to,
          type: RAFT_NETWORK_MSG_REQUEST,
          payload: {packet, reqId},
          delayMs: linkDelayMs,
        });
      });
    }
  }

  return rafts;
}

/**
 * Drive an async network forward to `untilMs` in bounded steps, flushing microtasks between
 * drains so liferaft's async handlers can enqueue their replies/follow-ups. A single
 * synchronous `run()` cannot complete a real election (handlers span microtasks); this is the
 * async analog of running to idle. Deterministic given the seed (FIFO microtasks + seeded
 * delivery order).
 * @param {Object} net
 * @param {Object} driveOptions - {untilMs, stepMs, flushTurns}.
 * @return {Promise<void>}
 */
async function driveNetwork(net, driveOptions = {}) {
  const untilMs = Number(driveOptions.untilMs);
  const rawStepMs = Number(driveOptions.stepMs);
  const stepMs = Number.isFinite(rawStepMs) && rawStepMs > RAFT_NETWORK_NUM_ZERO ?
    rawStepMs :
    RAFT_NETWORK_DEFAULT_STEP_MS;
  const flushTurns = Number.isFinite(Number(driveOptions.flushTurns)) ?
    Number(driveOptions.flushTurns) :
    RAFT_NETWORK_DEFAULT_FLUSH_TURNS;
  for (let tEnd = stepMs; tEnd <= untilMs; tEnd += stepMs) {
    net.run({untilMs: tEnd});
    await flushMicrotasks(flushTurns);
  }
}

export {connectRaftCluster, driveNetwork, flushMicrotasks};
