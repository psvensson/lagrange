/**
 * The node-local authorities a replica hosted on this node inherits.
 *
 * A replica is not a free-standing thing: it reads a node's cache, and - when
 * that node was SUPPLIED a clock and a randomness source - hosts its
 * consensus timers on that clock and draws its election timing from that
 * randomness. Both seed phases resolve the same authorities the same way, so
 * the rule lives in one place rather than in each phase.
 *
 * The clock here is the one the node runtime was given, never the one it
 * resolved for itself: a replica handed a resolved real clock would run
 * LifeRaft on VirtualTick and take its hops as zero-delay timers, which is a
 * different event-loop phase from the setImmediate production runs - and a
 * different one from the replicas the same node hosts as joiner. The node
 * runtime owns that question and answers it here.
 *
 * All three default to undefined, which is what every caller that does not
 * host several node runtimes in one process has always passed.
 *
 * @module bootstrap/shared/hosted-replica-authorities
 */

/**
 * @param {Object} delegates - The seed delegates.
 * @return {{timeSource: Object|undefined, nodeService: Object|undefined}}
 */
function resolveHostedReplicaAuthorities(delegates) {
  return {
    timeSource: (delegates.getSuppliedTimeSource ?
      delegates.getSuppliedTimeSource() :
      null) || undefined,
    nodeService: delegates.getNodeService ?
      delegates.getNodeService() :
      undefined,
    randomSource: delegates.getRandomSource ?
      delegates.getRandomSource() :
      undefined,
  };
}

/**
 * The clock a seed phase reads for waits it takes ON BEHALF OF THIS NODE -
 * leadership waits, backoff deadlines. Without a hosting runtime clock it is
 * the host clock, exactly as these sites read it before.
 *
 * @param {Object} delegates - The seed delegates.
 * @return {Function} a millisecond clock.
 */
function resolveHostedNodeClock(delegates) {
  const timeSource = delegates.getTimeSource ?
    delegates.getTimeSource() :
    null;
  return timeSource ? () => timeSource.now() : Date.now;
}

export {resolveHostedNodeClock, resolveHostedReplicaAuthorities};
